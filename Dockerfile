# 公司管理系统 PC Web 生产镜像。
#
# 构建前在 company-platform-web 目录执行：
#   npm ci
#   npm run build
# 再构建镜像：
#   docker build -t company-platform/frontend:1.0.0 .
FROM nginx:1.29-alpine

LABEL org.opencontainers.image.title="company-platform-web" \
      org.opencontainers.image.description="Company Platform Vue 3 PC Web" \
      org.opencontainers.image.version="1.0.0"

ENV TZ=Asia/Shanghai

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=20s --timeout=3s --start-period=10s --retries=5 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
