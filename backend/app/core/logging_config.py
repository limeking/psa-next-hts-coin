import logging
from logging.handlers import RotatingFileHandler
import os

LOG_DIR = os.environ.get("BACKEND_LOG_DIR", "/var/log/psa-next")
LOG_FILE = os.path.join(LOG_DIR, "backend.log")

def setup_logging():
    os.makedirs(LOG_DIR, exist_ok=True)
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    handler = RotatingFileHandler(LOG_FILE, maxBytes=10*1024*1024, backupCount=5)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    # stdout도 출력(운영환경 겸용)
    logging.basicConfig(level=logging.INFO)
