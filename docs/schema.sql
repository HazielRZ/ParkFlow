BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 2470abf75164

CREATE TABLE campuses (
    id SMALLSERIAL NOT NULL, 
    code VARCHAR(20) NOT NULL, 
    name VARCHAR(100) NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (code)
);

CREATE TABLE roles (
    id SMALLSERIAL NOT NULL, 
    name VARCHAR(30) NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (name)
);

CREATE TABLE users (
    id SERIAL NOT NULL, 
    email VARCHAR(255) NOT NULL, 
    password_hash VARCHAR(255) NOT NULL, 
    role_id SMALLINT NOT NULL, 
    is_active BOOLEAN DEFAULT true NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(role_id) REFERENCES roles (id) ON DELETE RESTRICT
);

CREATE INDEX ix_users_role_id ON users (role_id);

CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));

CREATE TABLE zones (
    id SERIAL NOT NULL, 
    campus_id SMALLINT NOT NULL, 
    code VARCHAR(64) NOT NULL, 
    name VARCHAR(100) NOT NULL, 
    camera_id UUID, 
    PRIMARY KEY (id), 
    FOREIGN KEY(campus_id) REFERENCES campuses (id) ON DELETE RESTRICT, 
    UNIQUE (code)
);

CREATE INDEX ix_zones_campus_id ON zones (campus_id);

CREATE TABLE audit_log (
    id BIGSERIAL NOT NULL, 
    user_id INTEGER, 
    event_type VARCHAR(40) NOT NULL, 
    entity_type VARCHAR(40), 
    entity_id VARCHAR(64), 
    detail JSONB, 
    ip_address INET, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX ix_audit_event_time ON audit_log (event_type, created_at DESC);

CREATE INDEX ix_audit_user_time ON audit_log (user_id, created_at DESC);

CREATE TABLE parking_spots (
    id SERIAL NOT NULL, 
    zone_id INTEGER NOT NULL, 
    polygon_key VARCHAR(64) NOT NULL, 
    slot_name VARCHAR(20) NOT NULL, 
    polygon JSONB NOT NULL, 
    is_active BOOLEAN DEFAULT true NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_spot_polygon_min_3_points CHECK (jsonb_typeof(polygon) = 'array' AND jsonb_array_length(polygon) >= 3), 
    FOREIGN KEY(zone_id) REFERENCES zones (id) ON DELETE RESTRICT, 
    UNIQUE (polygon_key), 
    CONSTRAINT uq_spot_zone_slot UNIQUE (zone_id, slot_name)
);

CREATE TABLE occupancy_history (
    id BIGSERIAL NOT NULL, 
    spot_id INTEGER NOT NULL, 
    zone_id INTEGER NOT NULL, 
    campus_id SMALLINT NOT NULL, 
    shift VARCHAR(15) NOT NULL, 
    state VARCHAR(15) NOT NULL, 
    confidence FLOAT NOT NULL, 
    iou_ratio FLOAT NOT NULL, 
    vehicle_type VARCHAR(15), 
    source VARCHAR(10) DEFAULT 'auto' NOT NULL, 
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_hist_shift CHECK (shift IN ('Matutino','Vespertino','Nocturno')), 
    CONSTRAINT ck_hist_source CHECK (source IN ('auto','manual')), 
    CONSTRAINT ck_hist_state CHECK (state IN ('Libre','Ocupado','En maniobra')), 
    CONSTRAINT ck_hist_ranges CHECK (confidence BETWEEN 0 AND 1 AND iou_ratio BETWEEN 0 AND 1), 
    FOREIGN KEY(campus_id) REFERENCES campuses (id) ON DELETE RESTRICT, 
    FOREIGN KEY(spot_id) REFERENCES parking_spots (id) ON DELETE RESTRICT, 
    FOREIGN KEY(zone_id) REFERENCES zones (id) ON DELETE RESTRICT
);

CREATE INDEX ix_hist_campus_zone_shift_time ON occupancy_history (campus_id, zone_id, shift, recorded_at DESC);

CREATE INDEX ix_hist_spot_time ON occupancy_history (spot_id, recorded_at DESC);

INSERT INTO alembic_version (version_num) VALUES ('2470abf75164') RETURNING alembic_version.version_num;

-- Running upgrade 2470abf75164 -> 92020a218810

INSERT INTO roles (name) VALUES ('Administrador');

INSERT INTO roles (name) VALUES ('Vigilancia');

INSERT INTO roles (name) VALUES ('Estudiante');

INSERT INTO roles (name) VALUES ('Tech Lead');

INSERT INTO roles (name) VALUES ('DevOps/QA');

INSERT INTO roles (name) VALUES ('Desarrollador');

INSERT INTO roles (name) VALUES ('Invitado');

INSERT INTO campuses (code, name) VALUES ('ITM-CAMPUS1', 'Campus 1');

INSERT INTO campuses (code, name) VALUES ('ITM-CAMPUS2', 'Campus 2');

UPDATE alembic_version SET version_num='92020a218810' WHERE alembic_version.version_num = '2470abf75164';

COMMIT;

