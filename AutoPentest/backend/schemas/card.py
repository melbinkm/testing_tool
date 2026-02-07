"""
Card Pydantic schemas
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class CardBase(BaseModel):
    card_type: str  # finding, observation, info
    section_number: Optional[str] = None  # Now optional - auto-managed globally
    title: str
    target_service: Optional[str] = None
    status: Optional[str] = None  # confirmed, potential, untested
    severity: Optional[str] = None  # CRITICAL, HIGH, MEDIUM, LOW, INFO
    technical_analysis: Optional[str] = None
    notes: Optional[str] = None
    proof: Optional[str] = None
    context: Optional[str] = None


class CardCreate(CardBase):
    """Schema for creating a new card"""
    pass


class CardUpdate(BaseModel):
    """Schema for updating a card (all fields optional)"""
    card_type: Optional[str] = None
    section_number: Optional[str] = None
    title: Optional[str] = None
    target_service: Optional[str] = None
    status: Optional[str] = None
    severity: Optional[str] = None
    technical_analysis: Optional[str] = None
    notes: Optional[str] = None
    proof: Optional[str] = None
    context: Optional[str] = None


class CardResponse(CardBase):
    """Schema for card response"""
    id: int
    assessment_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
