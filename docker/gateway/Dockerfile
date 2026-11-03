# Gateway for Render. Local compose mounts nginx.conf instead; here the official image fills in the template at start.
FROM nginx:1.27-alpine
COPY docker/gateway/render.conf.template /etc/nginx/templates/default.conf.template
