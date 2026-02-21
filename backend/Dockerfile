FROM ruby:4.0-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
  build-base \
  sqlite-dev \
  sqlite-libs \
  bash

# Copy Gemfile first for better caching
COPY Gemfile Gemfile.lock* ./

# Install gems
RUN bundle install --jobs 4 --retry 3

# Copy application code
COPY . .

# Create tmp/pids directory for Rails
RUN mkdir -p tmp/pids

# Database setup script
RUN echo '#!/bin/bash\n\
set -e\n\
if [ "$RAILS_ENV" = "production" ]; then\n\
  bundle exec rails db:migrate\n\
else\n\
  bundle exec rails db:create db:migrate db:seed 2>/dev/null || true\n\
fi\n\
exec "$@"' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]

# Expose port
EXPOSE 3000

# Start server
CMD ["rails", "server", "-b", "0.0.0.0"]
