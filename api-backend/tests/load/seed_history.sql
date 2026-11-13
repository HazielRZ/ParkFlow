-- 4 zonas y 400 cajones sintéticos
INSERT INTO zones (campus_id, code, name)
SELECT 1 + (g % 2), 'TEST-ZONA-' || g, 'Zona ' || g FROM generate_series(1,4) g;

INSERT INTO parking_spots (zone_id, polygon_key, slot_name, polygon)
SELECT z.id, 'poly-' || z.id || '-' || g, 'S-' || g,
       '[[0,0],[10,0],[10,10],[0,10]]'::jsonb
FROM zones z, generate_series(1,100) g WHERE z.code LIKE 'TEST-ZONA-%';

-- 2 millones de eventos en 180 días
WITH sp AS (
  SELECT s.id, s.zone_id, z.campus_id, row_number() OVER () AS rn
  FROM parking_spots s JOIN zones z ON z.id = s.zone_id
), n AS (SELECT count(*) AS c FROM sp)
INSERT INTO occupancy_history
  (spot_id, zone_id, campus_id, shift, state, confidence, iou_ratio, source, recorded_at)
SELECT sp.id, sp.zone_id, sp.campus_id,
  (ARRAY['Matutino','Vespertino','Nocturno'])[1 + floor(random()*3)::int],
  (ARRAY['Libre','Ocupado','En maniobra'])[1 + floor(random()*3)::int],
  random(), random(), 'auto', now() - random() * interval '180 days'
FROM generate_series(1, 2000000) g
JOIN n ON true
JOIN sp ON sp.rn = 1 + (g % n.c);

ANALYZE occupancy_history;