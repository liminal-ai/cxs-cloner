/** Thrown by stubs during development. */
export class NotImplementedError extends Error {
	constructor(functionName: string) {
		super(`${functionName} is not yet implemented`);
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
		public readonly candidates?: string[],
	) {
		const msg = candidates?.length
			? `Session "${sessionId}" not found. Did you mean: ${candidates.join(", ")}?`
			: `Session "${sessionId}" not found.`;
		super(msg);
		this.name = "SessionNotFoundError";
	}
}

export class AmbiguousMatchError extends CxsError {
	constructor(
		public readonly partialId: string,
		public readonly matches: string[],
	) {
		super(
			`Partial ID "${partialId}" matches multiple sessions: ${matches.join(", ")}`,
		);
		this.name = "AmbiguousMatchError";
	}
}

export class InvalidSessionError extends CxsError {
	constructor(
		public readonly filePath: string,
		public readonly reason: string,
	) {
		super(`Invalid session file "${filePath}": ${reason}`);
		this.name = "InvalidSessionError";
	}
}

export class MalformedJsonError extends CxsError {
	constructor(
		public readonly filePath: string,
		public readonly lineNumber: number,
	) {
		super(`Malformed JSON at line ${lineNumber} in "${filePath}"`);
		this.name = "MalformedJsonError";
	}
}

export class ConfigurationError extends CxsError {
	constructor(
		public readonly field: string,
		message: string,
	) {
		super(`Configuration error (${field}): ${message}`);
		this.name = "ConfigurationError";
	}
}

export class ArgumentValidationError extends CxsError {
	constructor(
		public readonly argument: string,
		message: string,
	) {
		super(`Invalid argument "${argument}": ${message}`);
		this.name = "ArgumentValidationError";
	}
}

export class FileOperationError extends CxsError {
	constructor(
		public readonly filePath: string,
		public readonly operation: "read" | "write" | "delete",
		message: string,
	) {
		super(`File ${operation} failed for "${filePath}": ${message}`);
		this.name = "FileOperationError";
	}
}

export class CloneCompatibilityError extends CxsError {
	constructor(message: string) {
		super(`Clone compatibility error: ${message}`);
		this.name = "CloneCompatibilityError";
	}
}
