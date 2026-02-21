# frozen_string_literal: true

class ApplicationController < ActionController::API
  include ActionController::Serialization

  rescue_from ActionController::ParameterMissing, with: :render_missing_parameter
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from StandardError, with: :render_internal_error

  before_action :log_request

  private

  def render_missing_parameter(exception)
    render json: {
      error: "Missing required parameter: #{exception.param}"
    }, status: :bad_request
  end

  def render_not_found(exception)
    render json: {
      error: "Record not found: #{exception.model}"
    }, status: :not_found
  end

  def render_internal_error(exception)
    Rails.logger.error(exception)
    render json: {
      error: "Internal server error"
    }, status: :internal_server_error
  end

  def log_request
    Rails.logger.info("#{request.method} #{request.path}")
  end
end
