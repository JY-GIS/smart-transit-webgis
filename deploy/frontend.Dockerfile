FROM nginx:1.29-alpine

LABEL org.opencontainers.image.title="smart-transit-frontend"

RUN rm -f /etc/nginx/conf.d/default.conf

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/dist/ /usr/share/nginx/html/
COPY test-artifacts/static-road-tiles/xyz/ /usr/share/nginx/html/static/roads/

EXPOSE 80
