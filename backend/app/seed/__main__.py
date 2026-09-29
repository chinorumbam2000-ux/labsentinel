"""``python -m app.seed``: seed the synthetic demonstration dataset."""

import sys

from sqlalchemy import make_url

from app.config import get_settings
from app.database import get_session_factory
from app.seed import load_dataset, seed_demo_dataset


def main() -> int:
    settings = get_settings()
    if settings.app_env == "production":
        print("Refusing to seed synthetic demonstration data with APP_ENV=production.")
        return 1

    url = make_url(settings.database_url.get_secret_value())
    print(f"Seeding synthetic demonstration data into {url.database!r} on {url.host}:{url.port}")

    dataset = load_dataset()
    with get_session_factory()() as session, session.begin():
        report = seed_demo_dataset(session, dataset)

    for line in report.lines():
        print(f"  {line}")
    print("Database changed." if report.changed else "Already up to date; nothing changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
