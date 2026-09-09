-- Track whether an authentication request's shipping was live-rated (EasyPost)
-- or fell back to the flat estimate. NULL = not applicable (True Blue all-in).
ALTER TABLE "AuthenticationRequest" ADD COLUMN "shipRated" BOOLEAN;
