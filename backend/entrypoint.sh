#!/bin/bash
set -e

# Install any new gems (volume mount may have updated Gemfile)
bundle install --quiet

if [ "$RAILS_ENV" = "production" ]; then
  bundle exec rails db:migrate
else
  bundle exec rails db:create db:migrate db:seed 2>/dev/null || true
fi

exec "$@"
