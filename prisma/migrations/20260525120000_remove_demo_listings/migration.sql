-- Remove seeded demo product data. Scoped to the three demo accounts
-- (admin@beaniex.com, seller@beaniex.com, buyer@beaniex.com); all real
-- user uploads remain untouched. Idempotent — safe to re-run.
--
-- Order matters: clear dependent rows before the parents they reference.

DO $$
DECLARE
  demo_ids text[];
BEGIN
  SELECT array_agg(id) INTO demo_ids
  FROM "User"
  WHERE email IN (
    'admin@beaniex.com',
    'seller@beaniex.com',
    'buyer@beaniex.com'
  );

  -- No demo users on this database — nothing to do.
  IF demo_ids IS NULL OR array_length(demo_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Shipment events tied to demo orders or demo auth requests.
  DELETE FROM "ShipmentEvent"
  WHERE "orderId" IN (
    SELECT id FROM "Order"
    WHERE "sellerId" = ANY(demo_ids) OR "buyerId" = ANY(demo_ids)
  );
  DELETE FROM "ShipmentEvent"
  WHERE "authRequestId" IN (
    SELECT id FROM "AuthenticationRequest"
    WHERE "userId" = ANY(demo_ids)
  );

  -- Registry entries owned by demo users.
  DELETE FROM "RegistryEntry"
  WHERE "ownerId" = ANY(demo_ids);

  -- Authentication requests submitted by demo users.
  DELETE FROM "AuthenticationRequest"
  WHERE "userId" = ANY(demo_ids);

  -- Orders involving demo users on either side.
  DELETE FROM "Order"
  WHERE "sellerId" = ANY(demo_ids) OR "buyerId" = ANY(demo_ids);

  -- Listings created by demo users (the fake products).
  DELETE FROM "Listing"
  WHERE "sellerId" = ANY(demo_ids);
END $$;
