"""
Command execution and history API endpoints
"""
from typing import List, Optional
import re
import base64
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from database import get_db, get_async_db
from models import CommandHistory, Assessment, Credential
from schemas.command import CommandExecute, CommandResponse, CommandsPaginatedResponse, CommandWithAssessmentResponse
from services.container_service import ContainerService

# Router for assessment-specific commands
router = APIRouter(prefix="/assessments/{assessment_id}/commands", tags=["commands"])

# Router for global commands view
global_router = APIRouter(prefix="/commands", tags=["global-commands"])


@router.get("", response_model=List[CommandResponse])
async def list_commands(
    assessment_id: int,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get command history for an assessment"""
    # Verify assessment exists
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assessment with id {assessment_id} not found"
        )

    commands = (
        db.query(CommandHistory)
        .filter(CommandHistory.assessment_id == assessment_id)
        .order_by(CommandHistory.created_at.desc())
        .limit(limit)
        .all()
    )

    return commands


@router.get("/{command_id}", response_model=CommandResponse)
async def get_command(
    assessment_id: int,
    command_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific command result"""
    command = db.query(CommandHistory).filter(
        CommandHistory.id == command_id,
        CommandHistory.assessment_id == assessment_id
    ).first()

    if not command:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Command with id {command_id} not found"
        )

    return command


@router.post("/execute", response_model=CommandResponse)
async def execute_command(
    assessment_id: int,
    command_data: CommandExecute,
    db: AsyncSession = Depends(get_async_db)
):
    """Execute a command in Exegol and log it (async optimized)"""
    # Verify assessment exists
    stmt = select(Assessment).filter(Assessment.id == assessment_id)
    result = await db.execute(stmt)
    assessment = result.scalar_one_or_none()

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assessment with id {assessment_id} not found"
        )

    # Execute command via Exegol service
    container_service = ContainerService()
    result = await container_service.execute_and_log_command(
        assessment_id=assessment_id,
        command=command_data.command,
        phase=command_data.phase,
        db=db
    )

    return result


@router.post("/execute-with-credentials", response_model=CommandResponse)
async def execute_command_with_credentials(
    assessment_id: int,
    command_data: CommandExecute,
    db: AsyncSession = Depends(get_async_db)
):
    """Execute command with automatic credential substitution (optimized single-call endpoint)"""
    # Verify assessment exists
    stmt = select(Assessment).filter(Assessment.id == assessment_id)
    result = await db.execute(stmt)
    assessment = result.scalar_one_or_none()

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assessment with id {assessment_id} not found"
        )

    command = command_data.command
    original_command = command

    # ========== CREDENTIAL SUBSTITUTION ==========
    # Find placeholders like {{PLACEHOLDER_NAME}}
    placeholders = re.findall(r'\{\{([A-Z0-9_]+)\}\}', command)

    if placeholders:
        # Fetch all credentials for this assessment
        stmt = select(Credential).filter(Credential.assessment_id == assessment_id)
        result = await db.execute(stmt)
        credentials = result.scalars().all()

        # Create placeholder -> credential mapping
        creds_map = {cred.placeholder.strip("{}"): cred for cred in credentials}

        # Replace each placeholder
        for placeholder in placeholders:
            if placeholder in creds_map:
                cred = creds_map[placeholder]

                # Determine replacement value based on credential type
                if cred.credential_type == "bearer_token":
                    replacement = cred.token
                elif cred.credential_type == "api_key":
                    replacement = cred.token
                elif cred.credential_type == "cookie":
                    replacement = cred.cookie_value
                elif cred.credential_type == "basic_auth":
                    # Encode as base64 for Basic Auth
                    auth_str = f"{cred.username}:{cred.password}"
                    b64 = base64.b64encode(auth_str.encode()).decode()
                    replacement = b64
                elif cred.credential_type == "ssh":
                    # For SSH, use username:password format
                    replacement = f"{cred.username}:{cred.password}"
                elif cred.credential_type == "custom":
                    # For custom, use first available field
                    replacement = cred.token or str(cred.custom_data or "")
                else:
                    replacement = ""

                # Perform replacement
                command = command.replace(f"{{{{{placeholder}}}}}", replacement)
            else:
                # Placeholder not found
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Placeholder '{{{{{placeholder}}}}}' not found in credentials"
                )

    # Execute command via Exegol service
    container_service = ContainerService()
    result = await container_service.execute_and_log_command(
        assessment_id=assessment_id,
        command=command,  # Command with substitutions
        phase=command_data.phase,
        db=db
    )

    return result


# ========== GLOBAL COMMANDS ROUTES ==========

@global_router.get("", response_model=CommandsPaginatedResponse)
async def list_all_commands(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all commands across all assessments with pagination and filtering"""

    # Start with base query joining Assessment for name
    query = db.query(CommandHistory).join(
        Assessment,
        CommandHistory.assessment_id == Assessment.id
    )

    # Filter by status
    if status and status != "all":
        if status == "completed":
            query = query.filter(CommandHistory.returncode == 0)
        elif status == "failed":
            query = query.filter(CommandHistory.returncode != 0)

    # Search filter across command, assessment name, and phase
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                CommandHistory.command.ilike(search_term),
                Assessment.name.ilike(search_term),
                CommandHistory.phase.ilike(search_term)
            )
        )

    # Get total count before pagination
    total = query.count()

    # Apply pagination and ordering
    commands = (
        query.order_by(CommandHistory.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Build response with assessment names
    commands_with_assessment = [
        CommandWithAssessmentResponse(
            id=cmd.id,
            assessment_id=cmd.assessment_id,
            container_name=cmd.container_name,
            command=cmd.command,
            stdout=cmd.stdout,
            stderr=cmd.stderr,
            returncode=cmd.returncode,
            execution_time=cmd.execution_time,
            success=cmd.success,
            phase=cmd.phase,
            status=cmd.status,
            created_at=cmd.created_at,
            assessment_name=cmd.assessment.name if cmd.assessment else "Unknown"
        )
        for cmd in commands
    ]

    return CommandsPaginatedResponse(
        commands=commands_with_assessment,
        total=total,
        skip=skip,
        limit=limit,
        has_more=(skip + limit) < total
    )
