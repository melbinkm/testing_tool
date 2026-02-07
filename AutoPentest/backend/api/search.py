"""
Unified Search API endpoint
"""
import time
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from schemas.search import SearchResponse, SearchRequest
from services.search_service import SearchService

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1, description="Search query"),
    types: Optional[str] = Query(None, description="Comma-separated types: assessment,command,finding,observation,info,recon"),
    assessment_id: Optional[int] = Query(None, description="Filter by assessment ID"),
    limit: int = Query(50, ge=1, le=100, description="Maximum results"),
    db: Session = Depends(get_db)
):
    """
    Unified search endpoint across all entities

    This endpoint provides fast, intelligent search with:
    - Single query instead of multiple API calls
    - Fuzzy matching for typo tolerance
    - Relevance scoring
    - Results grouped by type
    - Recency boost

    Example queries:
    - /search?q=nmap
    - /search?q=sql injection&types=finding,observation
    - /search?q=command&assessment_id=1
    """
    start_time = time.time()

    # Parse types filter
    type_list = None
    if types:
        type_list = [t.strip() for t in types.split(',')]

    # Execute search
    search_service = SearchService(db)
    results = search_service.search_all(
        query=q,
        types=type_list,
        assessment_id=assessment_id,
        limit=limit
    )

    # Group results by type
    grouped = {}
    for result in results:
        result_type = result.type
        if result_type not in grouped:
            grouped[result_type] = []
        grouped[result_type].append(result)

    execution_time = time.time() - start_time

    return SearchResponse(
        results=results,
        total=len(results),
        query=q,
        execution_time=round(execution_time, 3),
        grouped=grouped
    )
