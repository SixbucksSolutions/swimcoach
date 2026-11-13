FROM python:3.12-alpine
RUN apk add --no-cache tzdata
WORKDIR /app
COPY server.py ./
COPY static ./static
ENV SWIMCOACH_DB=/data/swimcoach.db SWIMCOACH_PORT=8787 PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8787
CMD ["python3", "server.py"]
