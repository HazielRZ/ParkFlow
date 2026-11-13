from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base

STATES = ("Libre", "Ocupado", "En maniobra")
SHIFTS = ("Matutino", "Vespertino", "Nocturno")  # AJUSTAR a los turnos reales del ITM
SOURCES = ("auto", "manual")


class Campus(Base):
    __tablename__ = "campuses"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)  # ITM-CAMPUS1
    name: Mapped[str] = mapped_column(String(100))


class Zone(Base):
    __tablename__ = "zones"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    campus_id: Mapped[int] = mapped_column(ForeignKey("campuses.id", ondelete="RESTRICT"))
    code: Mapped[str] = mapped_column(String(64), unique=True)  # = parking_lot_id del contrato
    name: Mapped[str] = mapped_column(String(100))
    camera_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))

    __table_args__ = (Index("ix_zones_campus_id", "campus_id"),)


class ParkingSpot(Base):
    __tablename__ = "parking_spots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id", ondelete="RESTRICT"))
    polygon_key: Mapped[str] = mapped_column(String(64), unique=True)  # = polygon_id del contrato
    slot_name: Mapped[str] = mapped_column(String(20))  # A-01
    polygon: Mapped[list] = mapped_column(JSONB)  # [[x, y], ...] en píxeles de cámara
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("zone_id", "slot_name", name="uq_spot_zone_slot"),
        CheckConstraint(
            "jsonb_typeof(polygon) = 'array' AND jsonb_array_length(polygon) >= 3",
            name="ck_spot_polygon_min_3_points",
        ),
    )


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(30), unique=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="RESTRICT"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("uq_users_email_lower", text("lower(email)"), unique=True),
        Index("ix_users_role_id", "role_id"),
    )


class OccupancyHistory(Base):
    __tablename__ = "occupancy_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    spot_id: Mapped[int] = mapped_column(ForeignKey("parking_spots.id", ondelete="RESTRICT"))
    # zone_id y campus_id desnormalizados a propósito: permiten filtrar sin JOINs.
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id", ondelete="RESTRICT"))
    campus_id: Mapped[int] = mapped_column(ForeignKey("campuses.id", ondelete="RESTRICT"))
    shift: Mapped[str] = mapped_column(String(15))  # lo calcula la app al insertar
    state: Mapped[str] = mapped_column(String(15))
    confidence: Mapped[float] = mapped_column(Float)
    iou_ratio: Mapped[float] = mapped_column(Float)
    vehicle_type: Mapped[Optional[str]] = mapped_column(String(15))
    source: Mapped[str] = mapped_column(String(10), server_default="auto")
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("state IN ('Libre','Ocupado','En maniobra')", name="ck_hist_state"),
        CheckConstraint("shift IN ('Matutino','Vespertino','Nocturno')", name="ck_hist_shift"),
        CheckConstraint("source IN ('auto','manual')", name="ck_hist_source"),
        CheckConstraint(
            "confidence BETWEEN 0 AND 1 AND iou_ratio BETWEEN 0 AND 1",
            name="ck_hist_ranges",
        ),
        # Consulta típica: campus + zona + turno + rango de fechas
        Index(
            "ix_hist_campus_zone_shift_time",
            "campus_id",
            "zone_id",
            "shift",
            text("recorded_at DESC"),
        ),
        Index("ix_hist_spot_time", "spot_id", text("recorded_at DESC")),
    )


class AuditLog(Base):
    """Cubre sobrescrituras manuales (RF-03) y accesos/denegaciones RBAC (RNF-02)."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # LOGIN, ACCESO_DENEGADO, OVERRIDE_MANUAL, CALIBRACION_CAJON, ...
    event_type: Mapped[str] = mapped_column(String(40))
    entity_type: Mapped[Optional[str]] = mapped_column(String(40))
    entity_id: Mapped[Optional[str]] = mapped_column(String(64))
    detail: Mapped[Optional[dict]] = mapped_column(JSONB)  # {"antes": "Libre", "despues": "Ocupado"}
    ip_address: Mapped[Optional[str]] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("ix_audit_user_time", "user_id", text("created_at DESC")),
        Index("ix_audit_event_time", "event_type", text("created_at DESC")),
    )