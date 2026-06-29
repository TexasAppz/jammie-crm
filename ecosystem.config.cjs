module.exports = {
  apps: [
    {
      name:   'jammie-crm-ui',
      script: '/usr/bin/serve',
      args:   '-s dist -l 3000',
      env: { NODE_ENV: 'production' },
    },
    {
      name:    'jammie-crm-api',
      script:  'server/index.cjs',
      cwd:     '/home/jaimiho/jammie-crm',
      watch:   false,
      env: {
        NODE_ENV:    'production',
        API_PORT:    3001,
        DB_HOST:     'localhost',
        DB_PORT:     3306,
        DB_USER:     'root',
        DB_PASSWORD: 'texasappz',
        DB_NAME:     'jammie_crm_db',
      },
    },
  ],
};
