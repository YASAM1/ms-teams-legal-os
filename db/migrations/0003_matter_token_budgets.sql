CREATE TABLE IF NOT EXISTS "matter_token_budgets" (
  "matter_id" uuid PRIMARY KEY NOT NULL,
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "estimated_usd_cents" integer NOT NULL DEFAULT 0,
  "soft_limit_cents" integer NOT NULL DEFAULT 2000,
  "hard_limit_cents" integer NOT NULL DEFAULT 10000,
  "soft_alerted_at" timestamp with time zone,
  "hard_alerted_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "matter_token_budgets"
    ADD CONSTRAINT "matter_token_budgets_matter_id_matters_id_fk"
    FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE cascade;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
