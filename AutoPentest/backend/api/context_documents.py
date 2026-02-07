"""
Context Documents API - Endpoints for managing user-provided context documents
"""
import os
import shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from database import get_db
from models import Assessment
from models.platform_settings import PlatformSettings
from config import settings
from utils.logger import get_logger
from utils.tree_generator import generate_workspace_tree, get_context_files_list
from services.container_service import ContainerService

logger = get_logger(__name__)

router = APIRouter(prefix="/assessments", tags=["context_documents"])

# Allowed
ALLOWED_EXTENSIONS = {
    '.pdf', '.txt', '.md', '.doc', '.docx',
    '.json', '.yaml', '.yml', '.xml', '.ini', '.conf',
    '.png', '.jpg', '.jpeg', '.svg',
    '.zip', '.tar', '.gz',
    '.csv', '.log', '.html', '.htm'
}

# File size limits
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_TOTAL_SIZE = 50 * 1024 * 1024  # 50MB per assessment


def _sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal attacks"""
    # Remove any directory components
    filename = os.path.basename(filename)
    
    # Remove potentially dangerous characters
    safe_chars = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._- ')
    filename = ''.join(c if c in safe_chars else '_' for c in filename)
    
    # Ensure it has an extension
    if '.' not in filename:
        filename += '.txt'
    
    return filename


async def _get_context_path(assessment_id: int, db: Session) -> tuple[str, str]:
    """
    Get container name and context path for an assessment
    
    Returns:
        Tuple of (container_name, context_path)
    """
    # Load assessment
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    if not assessment.workspace_path:
        raise HTTPException(
            status_code=400,
            detail="Assessment has no workspace. Create one first."
        )
    
    # Get container name (from assessment or platform settings)
    container_name = assessment.container_name
    
    if not container_name:
        container_setting = db.query(PlatformSettings).filter(
            PlatformSettings.key == "container_name"
        ).first()
        container_name = container_setting.value if container_setting else settings.DEFAULT_CONTAINER_NAME
    
    context_path = f"{assessment.workspace_path}/context"
    
    return container_name, context_path


@router.post("/{assessment_id}/context/upload", status_code=status.HTTP_201_CREATED)
async def upload_context_document(
    assessment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload a context document to assessment workspace
    
    Args:
        assessment_id: ID of the assessment
        file: File to upload
        
    Returns:
        Dict with filename, size, and path
    """
    logger.info("Uploading context document", assessment_id=assessment_id, filename=file.filename)
    
    try:
        # Validate file extension
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type '{file_ext}' not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
            )
        
        # Sanitize filename
        safe_filename = _sanitize_filename(file.filename)
        
        # Read file content
        content = await file.read()
        file_size = len(content)
        
        # Validate file size
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File size ({file_size / 1024 / 1024:.2f}MB) exceeds limit ({MAX_FILE_SIZE / 1024 / 1024}MB)"
            )
        
        # Get context path
        container_name, context_path = await _get_context_path(assessment_id, db)
        
        # Create temp file on host
        temp_file_path = f"/tmp/{safe_filename}"
        with open(temp_file_path, "wb") as f:
            f.write(content)
        
        try:
            # Copy file to container
            container_service = ContainerService()
            container_service.current_container = container_name
            
            # Ensure context directory exists
            await container_service.execute_container_command(f"mkdir -p {context_path}")
            
            # Copy file from host to container
            import asyncio
            process = await asyncio.create_subprocess_exec(
                "docker", "cp", temp_file_path, f"{container_name}:{context_path}/{safe_filename}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                error_msg = stderr.decode('utf-8', errors='replace')
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to copy file to container: {error_msg}"
                )
            
            logger.info(
                "Context document uploaded successfully",
                assessment_id=assessment_id,
                filename=safe_filename,
                size=file_size
            )
            
            return {
                "success": True,
                "filename": safe_filename,
                "size": file_size,
                "size_human": f"{file_size / 1024:.2f}KB" if file_size < 1024 * 1024 else f"{file_size / 1024 / 1024:.2f}MB",
                "path": f"{context_path}/{safe_filename}"
            }
            
        finally:
            # Clean up temp file
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to upload context document", assessment_id=assessment_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{assessment_id}/context/files")
async def list_context_documents(
    assessment_id: int,
    db: Session = Depends(get_db)
):
    """
    List all context documents for an assessment
    
    Returns:
        List of files with metadata
    """
    logger.info("Listing context documents", assessment_id=assessment_id)
    
    try:
        # Get assessment
        assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
        
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")
        
        if not assessment.workspace_path:
            return []
        
        # Get container name
        container_name, _ = await _get_context_path(assessment_id, db)
        
        # Get file list using tree generator utility
        files = await get_context_files_list(container_name, assessment.workspace_path)
        
        logger.info("Listed context documents", assessment_id=assessment_id, count=len(files))
        
        return files
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to list context documents", assessment_id=assessment_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{assessment_id}/context/{filename}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_context_document(
    assessment_id: int,
    filename: str,
    db: Session = Depends(get_db)
):
    """
    Delete a context document
    
    Args:
        assessment_id: ID of the assessment
        filename: Name of the file to delete
    """
    logger.info("Deleting context document", assessment_id=assessment_id, filename=filename)
    
    try:
        # Sanitize filename to prevent path traversal
        safe_filename = _sanitize_filename(filename)
        
        # Get context path
        container_name, context_path = await _get_context_path(assessment_id, db)
        
        # Delete file in container
        container_service = ContainerService()
        container_service.current_container = container_name
        
        result = await container_service.execute_container_command(
            f"rm -f {context_path}/{safe_filename}"
        )
        
        if not result["success"]:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete file: {result.get('stderr', 'Unknown error')}"
            )
        
        logger.info("Context document deleted", assessment_id=assessment_id, filename=safe_filename)
        
        return None
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete context document", assessment_id=assessment_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{assessment_id}/context/tree")
async def get_workspace_tree(
    assessment_id: int,
    db: Session = Depends(get_db)
):
    """
    Get workspace tree structure
    
    Returns:
        ASCII tree structure of the workspace
    """
    logger.info("Generating workspace tree", assessment_id=assessment_id)
    
    try:
        # Get assessment
        assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
        
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")
        
        if not assessment.workspace_path:
            return {"tree": "Workspace not created yet"}
        
        # Get container name
        container_name, _ = await _get_context_path(assessment_id, db)
        
        # Generate tree
        tree_text = await generate_workspace_tree(
            container_name=container_name,
            workspace_path=assessment.workspace_path,
            max_depth=2
        )
        
        logger.info("Generated workspace tree", assessment_id=assessment_id)
        
        return {
            "tree": tree_text,
            "workspace_path": assessment.workspace_path
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to generate workspace tree", assessment_id=assessment_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
