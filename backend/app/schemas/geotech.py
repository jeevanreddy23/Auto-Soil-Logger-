from typing import Literal
from pydantic import BaseModel, Field, field_validator

# --- 1. Typed Geotechnical Domain Models ---

class SoilLogInterval(BaseModel):
    depth_from: float = Field(..., ge=0.0, description="Start depth in meters")
    depth_to: float = Field(..., gt=0.0, description="End depth in meters")
    major_type: Literal["TOPSOIL", "CLAY", "SILT", "SAND", "GRAVEL", "PEAT"]
    secondary: str | None = None
    color: str
    moisture: Literal["Dry", "Moist", "Wet", "Saturated"]
    consistency: Literal["Very Soft", "Soft", "Firm", "Stiff", "Very Stiff", "Hard"] | None = None
    density: Literal["Very Loose", "Loose", "Medium Dense", "Dense", "Very Dense"] | None = None

    @field_validator("depth_to")
    @classmethod
    def validate_depth_order(cls, v: float, info) -> float:
        if "depth_from" in info.data and v <= info.data["depth_from"]:
            raise ValueError("depth_to must be strictly greater than depth_from")
        return v

class RockLogInterval(BaseModel):
    depth_from: float = Field(..., ge=0.0)
    depth_to: float = Field(..., gt=0.0)
    rock_type: Literal["SANDSTONE", "SHALE", "SILTSTONE", "BASALT", "GRANITE"]
    weathering: Literal["Fresh (FR)", "Slightly (SW)", "Moderately (MW)", "Highly (HW)", "Extremely (XW)"]
    strength: Literal["Extremely Low (EL)", "Very Low (VL)", "Low (L)", "Medium (M)", "High (H)", "Very High (VH)"]
    structure: str | None = None
    defects: list[str] = Field(default_factory=list)

    @field_validator("depth_to")
    @classmethod
    def validate_rock_depth_order(cls, v: float, info) -> float:
        if "depth_from" in info.data and v <= info.data["depth_from"]:
            raise ValueError("depth_to must be strictly greater than depth_from")
        return v

# --- 2. Validation & Prediction Response Schemas ---

class ValidationIssue(BaseModel):
    severity: Literal["error", "warning", "suggestion"]
    depth_from: float | None = None
    depth_to: float | None = None
    field: str | None = None
    message: str
    recommended_action: str

class BoreholeQAResult(BaseModel):
    valid: bool
    issues: list[ValidationIssue]
    as1726_formatted_description: str

class FieldPrediction(BaseModel):
    field_name: str
    suggested_value: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    reasoning: str
    nearby_context: list[str] = Field(default_factory=list)

class IntervalPrediction(BaseModel):
    depth_from: float
    depth_to: float
    material_type: Literal["SOIL", "ROCK"]
    predictions: list[FieldPrediction]

class AuditEvent(BaseModel):
    borehole_id: str
    event_type: Literal["prediction_generated", "prediction_accepted", "qa_validation"]
    payload: dict
    timestamp: str | None = None
