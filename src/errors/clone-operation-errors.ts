/** Thrown by stubs during development. */
export class NotImplementedError extends Error {
	constructor(method: string) {
		super(`Not implemented: ${method}`);
		this.name = "NotImplementedError";
	}
}

/** Base class for all cxs-cloner feature errors. */
export class CxsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CxsError";
	}
}

export class SessionNotFoundError extends CxsError {
	constructor(
		public readonly sessionId: string,
		public readonly candidates: string[] = [],
	) {
		super(`Session not found: ${sessionId}`);
		this.name = "SessionNotFoundError";
	}
}

export class AmbiguousMatchError extends CxsError {
	constructor(
		public readonly partialId: string,
		public readonly matches: string[],
	) {
		super(
			`Ambiguous session ID "${partialId}" matches ${matches.length} sessions`,
		);
		this.name = "AmbiguousMatchError";
	}
}

export class InvalidSessionError extends CxsError {
	constructor(
		public readonly filePath: string,
		public readonly reason: string,
	) {
		super(`Invalid session at ${filePath}: ${reason}`);
		this.name = "InvalidSessionError";
	}
}

export class MalformedJsonError extends CxsError {
	constructor(
		public readonly filePath: string,
		public readonly lineNumber: number,
	) {
		super(`Malformed JSON at ${filePath}:${lineNumber}`);
		this.name = "MalformedJsonError";
	}
}

export class ConfigurationError extends CxsError {
	constructor(
		public readonly field: string,
		message: string,
	) {
		super(message);
		this.name = "ConfigurationError";
	}
}

export class ArgumentValidationError extends CxsError {
	constructor(
		public readonly argument: string,
		message: string,
	) {
		super(message);
		this.name = "ArgumentValidationError";
	}
}

export class FileOperationError extends CxsError {
	constructor(
		public readonly filePath: string,
		public readonly operation: string,
		message: string,
	) {
		super(message);
		this.name = "FileOperationError";
	}
}
