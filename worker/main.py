from __future__ import annotations

import argparse
import time

from coursepilot_worker.config import Settings
from coursepilot_worker.parser import DoclingParser
from coursepilot_worker.processor import Processor
from coursepilot_worker.providers import ModelServices
from coursepilot_worker.repository import Repository


def main() -> None:
    parser = argparse.ArgumentParser(description="Process queued CoursePilot documents.")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job and exit.")
    args = parser.parse_args()

    settings = Settings.from_env()
    repository = Repository(settings)
    processor = Processor(
        settings=settings,
        repository=repository,
        parser=DoclingParser(),
        models=ModelServices(settings),
    )
    requeued = repository.requeue_stale_jobs()
    if requeued:
        print(f"Requeued {requeued} stale processing job(s).")

    while True:
        job = repository.claim_job(settings.worker_id)
        if job:
            processor.process(job)
        elif args.once:
            print("No queued CoursePilot documents.")
            return
        else:
            time.sleep(settings.poll_seconds)
        if args.once:
            return


if __name__ == "__main__":
    main()
