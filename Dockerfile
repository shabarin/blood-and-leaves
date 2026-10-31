FROM python:3.12-alpine

WORKDIR /app

# The game is fully static: no npm/pip dependencies, no build step.
COPY index.html styles.css serve.py ./
COPY src ./src
COPY vendor ./vendor

# Render injects $PORT. serve.py reads it and binds to 0.0.0.0.
ENV HOST=0.0.0.0 \
    PORT=10000 \
    PYTHONUNBUFFERED=1

RUN adduser -D -H -u 10001 appuser
USER appuser

EXPOSE 10000

CMD ["python", "serve.py"]
