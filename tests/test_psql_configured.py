import importlib.util
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "psql_configured.py"
spec = importlib.util.spec_from_file_location("psql_configured", SCRIPT)
assert spec and spec.loader
configured = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configured)


class PasswordFileTest(unittest.TestCase):
    def test_reads_target_without_returning_password_and_handles_escapes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pgpass"
            path.write_text("# sample\nlocalhost:5432:escolar:app_user:secret\\:part\\\\tail\n")
            path.chmod(0o600)
            self.assertEqual(configured.parse_pgpass_target(path), ("localhost", "5432", "escolar", "app_user"))

    def test_rejects_insecure_permissions_and_ambiguous_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pgpass"
            path.write_text("localhost:5432:escolar:app_user:secret\n")
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                configured.parse_pgpass_target(path)
            path.chmod(0o600)
            path.write_text("*:5432:escolar:app_user:secret\n")
            with self.assertRaises(ValueError):
                configured.parse_pgpass_target(path)
            path.write_text("localhost:5432:escolar:YOUR_DB_USERNAME:YOUR_DB_PASSWORD\n")
            with self.assertRaises(ValueError):
                configured.parse_pgpass_target(path)


if __name__ == "__main__":
    unittest.main()
