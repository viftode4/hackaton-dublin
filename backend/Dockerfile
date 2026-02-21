FROM ruby:3.3-alpine

WORKDIR /app

# Install system dependencies (yaml-dev needed for psych gem)
RUN apk add --no-cache \
  build-base \
  sqlite-dev \
  sqlite-libs \
  yaml-dev \
  bash \
  && apk info -e yaml-dev

# Copy Gemfile first for better caching
COPY Gemfile Gemfile.lock* ./

# Install gems
RUN bundle install --jobs 4 --retry 3

# Copy application code and entrypoint
COPY . .

# Create tmp/pids directory for Rails
RUN mkdir -p tmp/pids && chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]

EXPOSE 3000

CMD ["rails", "server", "-b", "0.0.0.0"]
