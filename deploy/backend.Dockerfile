FROM eclipse-temurin:17-jre-jammy

LABEL org.opencontainers.image.title="smart-transit-backend"

RUN groupadd --system --gid 10001 smarttransit \
    && useradd --system --uid 10001 --gid smarttransit --home-dir /app smarttransit

WORKDIR /app

COPY --chown=smarttransit:smarttransit \
    backend/target/smart-transit-backend-0.0.1-SNAPSHOT.jar \
    /app/app.jar

RUN chmod 0444 /app/app.jar

USER smarttransit

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
