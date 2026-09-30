# LabSentinel API — container image for a capstone presentation / production-like
# deployment. Synthetic data only; not a clinical system.
#
#   docker build -t labsentinel-api backend/
#   docker run --rm -p 8000:8000 --env-file <your env file> labsentinel-api
#
# Configuration comes only from environment variables (see
# deploy/env/backend.*.env.example). No secret is baked into the image, and
# backend/.env is excluded by .dockerignore.
#
# Migrations are a separate release step, never implicit:
#   docker run --rm --env-file <env> labsentinel-api alembic upgrade head
#   docker run --rm --env-file <env> labsentinel-api python -m app.seed

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app
COPY examples ./examples
COPY evaluation-results ./evaluation-results

# Run as an unprivileged user.
RUN useradd --create-home --uid 10001 labsentinel
USER labsentinel

# Hosting platforms usually inject PORT; 8000 locally. --proxy-headers because
# HTTPS is terminated by the platform's load balancer.
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
