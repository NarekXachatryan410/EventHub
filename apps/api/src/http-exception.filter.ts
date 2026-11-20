import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const isHttpError = exception instanceof HttpException;
    const statusCode = isHttpError
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    if (isHttpError && statusCode < HttpStatus.INTERNAL_SERVER_ERROR) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const bodyMessage = (body as { message?: unknown }).message;
        const bodyError = (body as { error?: unknown }).error;
        if (
          typeof bodyMessage === 'string' ||
          (Array.isArray(bodyMessage) &&
            bodyMessage.every((item) => typeof item === 'string'))
        ) {
          message = bodyMessage;
        } else {
          message = exception.message;
        }
        if (typeof bodyError === 'string') error = bodyError;
      } else {
        message = exception.message;
      }
    } else {
      this.logger.error(
        `Unhandled API error for ${request.method} ${request.path}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      statusCode,
      error,
      message,
      path: request.path,
      timestamp: new Date().toISOString(),
    });
  }
}
