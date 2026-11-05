-- Database roles (local development passwords are documented in the README).
--   icebank_app  the application itself
--   qa_reader    read-only, for JDBC/DBeaver checks
--   qa_writer    read/write, for test setup over JDBC
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'icebank_app') THEN
    CREATE ROLE icebank_app LOGIN PASSWORD 'icebank_app';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qa_reader') THEN
    CREATE ROLE qa_reader LOGIN PASSWORD 'qa_reader';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qa_writer') THEN
    CREATE ROLE qa_writer LOGIN PASSWORD 'qa_writer';
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO icebank_app, qa_reader, qa_writer', current_database());
END $$;
GRANT USAGE ON SCHEMA public TO icebank_app, qa_reader, qa_writer;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO icebank_app, qa_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO icebank_app, qa_writer;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO icebank_app, qa_writer;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO qa_reader;
REVOKE EXECUTE ON FUNCTION post_entry(INT, BIGINT, TEXT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, qa_reader;
REVOKE EXECUTE ON FUNCTION hold_entry(INT, BIGINT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, qa_reader;
REVOKE EXECUTE ON FUNCTION settle_entry(INT, BIGINT) FROM PUBLIC, qa_reader;
REVOKE EXECUTE ON FUNCTION release_entry(INT, BIGINT) FROM PUBLIC, qa_reader;
REVOKE EXECUTE ON FUNCTION post_transfer(BIGINT, BIGINT, NUMERIC, TEXT, INT) FROM PUBLIC, qa_reader;
REVOKE EXECUTE ON FUNCTION reset_sandbox(INT) FROM PUBLIC, qa_reader, qa_writer;
GRANT EXECUTE ON FUNCTION reset_sandbox(INT) TO icebank_app;

-- The sandbox key hashes are not for test users.
REVOKE ALL ON sandboxes FROM qa_reader, qa_writer;
GRANT SELECT (id, name, clock_offset_seconds, processed_through, created_at) ON sandboxes TO qa_reader, qa_writer;

-- Tables created by later migrations get the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO icebank_app, qa_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO qa_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO icebank_app, qa_writer;
