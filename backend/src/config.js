module.exports = {
  port: parseInt(process.env.PORT || '5000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpires: process.env.JWT_EXPIRES || '7d',
  db: {
    host: process.env.DB_HOST || 'db',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'taskhive',
    password: process.env.DB_PASSWORD || 'taskhive',
    database: process.env.DB_NAME || 'taskhive',
  },
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
  logDir: process.env.LOG_DIR || '/app/logs',
  dashboardTtl: parseInt(process.env.DASHBOARD_CACHE_TTL || '60', 10),
  maxLogoChars: 400 * 1024, // base64 data URL, ~300 KB image
};
