"""
Command Pydantic schemas
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class CommandExecute(BaseModel):
    """Schema for executing a command"""
    command: str
    phase: Optional[str] = None


class CommandResponse(BaseModel):
    """Schema for command response"""
    id: int
    assessment_id: int
    container_name: Optional[str]
    command: str
    stdout: Optional[str]
    stderr: Optional[str]
    returncode: Optional[int]
    execution_time: Optional[float]
    success: Optional[bool]
    phase: Optional[str]
    status: Optional[str]  # completed, failed, timeout, running
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CommandWithAssessmentResponse(CommandResponse):
    """Schema for command response with assessment info"""
    assessment_name: str


class CommandsPaginatedResponse(BaseModel):
    """Schema for paginated commands response"""
    commands: list[CommandWithAssessmentResponse]
    total: int
    skip: int
    limit: int
    has_more: bool
