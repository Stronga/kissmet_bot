ALTER TABLE bookings ADD COLUMN priced_room_id INTEGER REFERENCES rooms(id) ON DELETE RESTRICT;
ALTER TABLE bookings ADD COLUMN priced_room_rate_id INTEGER REFERENCES room_rates(id) ON DELETE RESTRICT;
ALTER TABLE bookings ADD COLUMN payment_attention_required INTEGER NOT NULL DEFAULT 0 CHECK (payment_attention_required IN (0, 1));
ALTER TABLE bookings ADD COLUMN payment_attention_reason TEXT;

CREATE INDEX idx_bookings_priced_room ON bookings(priced_room_id);
CREATE INDEX idx_bookings_priced_room_rate ON bookings(priced_room_rate_id);
