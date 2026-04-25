"""Learning Hub — backend API routes for SCORM extraction operations.

Mounted at /api/plugins/learning-hub/ by the dashboard plugin system.
"""

import asyncio
import hashlib
import json
import os
import re
import subprocess
import time
import traceback
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory job store (swap for SQLite/Redis in production)
# ---------------------------------------------------------------------------

JOB_STORE: dict[str, dict[str, Any]] = {}
LIBRARY_STORE: dict[str, dict[str, Any]] = {}

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ExtractRequest(BaseModel):
    url: str = Field(..., description="Public SCORM or e-learning module URL")
    engine: str = Field("auto", description="Extraction engine: auto, generic, cdp")
    max_slides: int = Field(200, ge=1, le=1000)

class QueryRequest(BaseModel):
    q: str = Field(..., min_length=1, description="Search query across extracted content")
    limit: int = Field(10, ge=1, le=50)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _job_id(url: str) -> str:
    return hashlib.sha256(f"{url}:{time.time()}".encode()).hexdigest()[:16]

def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"

def _sanitize_filename(name: str) -> str:
    return re.sub(r"[^\w\-_.]", "_", name)[:64]

# ---------------------------------------------------------------------------
# Extraction engines
# ---------------------------------------------------------------------------

def _extract_generic(url: str, max_slides: int) -> dict[str, Any]:
    """Lightweight generic engine — requests + regex for public HTML/SCORM demos."""
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError as exc:
        raise RuntimeError("Missing dependencies: pip install requests beautifulsoup4") from exc

    resp = requests.get(url, timeout=30, headers={"User-Agent": "Hermes-LearningHub/1.0"})
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    # Attempt to find slide-like sections or frames
    slides = []
    candidates = soup.find_all(["section", "article", "div", "slide"])
    for i, tag in enumerate(candidates[:max_slides], 1):
        text = tag.get_text(separator=" ", strip=True)
        if len(text) > 20:
            slides.append({"slide": i, "text": text[:800]})

    if not slides:
        # Fallback: treat the whole body as one slide
        body_text = soup.get_text(separator="\n", strip=True)
        slides = [{"slide": 1, "text": body_text[:2000]}]

    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else "Untitled Module"

    return {
        "title": title,
        "source_url": url,
        "engine": "generic",
        "slides_found": len(slides),
        "slides": slides,
        "markdown": f"# {title}\n\n" + "\n\n".join(f"## Slide {s['slide']}\n\n{s['text']}" for s in slides),
    }

def _extract_cdp(url: str, max_slides: int) -> dict[str, Any]:
    """CDP passthrough engine — delegates to cdp_scorm_extractor.py if available."""
    script_path = os.path.expanduser("~/hermes-scorm-extractor/scripts/cdp_scorm_extractor.py")
    if not os.path.exists(script_path):
        raise FileNotFoundError("CDP extractor script not found. Install hermes-scorm-extractor.")

    result = subprocess.run(
        ["python3", script_path, "--url", url, "--max-slides", str(max_slides), "--format", "json"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"CDP extraction failed: {result.stderr}")

    data = json.loads(result.stdout)
    slides = data.get("slides", [])
    return {
        "title": data.get("title", "Untitled Module"),
        "source_url": url,
        "engine": "cdp",
        "slides_found": len(slides),
        "slides": slides,
        "markdown": data.get("markdown", ""),
    }

def _run_extraction(job_id: str, url: str, engine: str, max_slides: int) -> None:
    """Blocking worker — runs in a background thread."""
    JOB_STORE[job_id]["status"] = "running"
    JOB_STORE[job_id]["started_at"] = _now_iso()

    try:
        if engine == "cdp":
            result = _extract_cdp(url, max_slides)
        elif engine == "generic":
            result = _extract_generic(url, max_slides)
        else:  # auto
            try:
                result = _extract_cdp(url, max_slides)
            except Exception:
                result = _extract_generic(url, max_slides)

        JOB_STORE[job_id].update({
            "status": "completed",
            "finished_at": _now_iso(),
            "result": result,
        })
        LIBRARY_STORE[job_id] = {
            "id": job_id,
            "title": result["title"],
            "source_url": url,
            "engine": result["engine"],
            "slides_found": result["slides_found"],
            "extracted_at": _now_iso(),
            "markdown": result["markdown"],
        }
    except Exception as exc:
        JOB_STORE[job_id].update({
            "status": "failed",
            "finished_at": _now_iso(),
            "error": str(exc),
            "traceback": traceback.format_exc(),
        })

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/extract")
async def extract(req: ExtractRequest, background: BackgroundTasks):
    """Queue a new extraction job."""
    job_id = _job_id(req.url)
    JOB_STORE[job_id] = {
        "id": job_id,
        "url": req.url,
        "engine": req.engine,
        "status": "queued",
        "created_at": _now_iso(),
    }
    background.add_task(_run_extraction, job_id, req.url, req.engine, req.max_slides)
    return {"job_id": job_id, "status": "queued"}

@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Poll extraction progress and results."""
    job = JOB_STORE.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.get("/library")
async def list_library():
    """List all successfully extracted modules."""
    return {"items": list(LIBRARY_STORE.values())}

@router.get("/library/{job_id}")
async def get_library_item(job_id: str):
    """Fetch full markdown for a completed extraction."""
    item = LIBRARY_STORE.get(job_id)
    if not item:
        raise HTTPException(status_code=404, detail="Library item not found")
    return item

@router.post("/query")
async def query(req: QueryRequest):
    """Simple text search across extracted library content."""
    query_lower = req.q.lower()
    hits = []
    for item in LIBRARY_STORE.values():
        score = 0
        if query_lower in item["title"].lower():
            score += 10
        md = item.get("markdown", "")
        if query_lower in md.lower():
            score += md.lower().count(query_lower)
        if score:
            snippet_start = md.lower().find(query_lower)
            snippet = md[max(0, snippet_start - 80):snippet_start + 200] if snippet_start != -1 else ""
            hits.append({
                "job_id": item["id"],
                "title": item["title"],
                "score": score,
                "snippet": snippet.replace("\n", " "),
            })
    hits.sort(key=lambda x: x["score"], reverse=True)
    return {"results": hits[:req.limit]}
