export type CompressionMode = 'medium' | 'large';
export interface CompressionMarker {
    readonly mode: CompressionMode;
    readonly originalChars: number;
    readonly savedChars: number;
    readonly spillId: string;
}
export declare const TOKEN_OPTIMIZER_MARKER = "dsh-token-optimizer";
export declare function countCodePoints(text: string): number;
/** Remove CSI, OSC, and common single-character ANSI control sequences. */
export declare function stripAnsi(text: string): string;
/** Keep at most one empty line between non-empty lines. */
export declare function foldBlankLines(text: string): string;
/** Replace a run of three or more identical lines with one line and a marker. */
export declare function foldRepeatedLines(text: string): string;
/** Deterministic medium-result normalization before bounded head/tail retention. */
export declare function compressMedium(text: string): string;
/** Keep a deterministic head/tail body, measured in Unicode code points. */
export declare function headTailPreview(text: string, headChars: number, tailChars: number): string;
/** Keep a deterministic symmetric head/tail preview. */
export declare function previewText(text: string, maxChars: number): string;
export declare function formatCompressionNotice(mode: CompressionMode, originalChars: number, savedChars: number, spillId: string): string;
export interface CompressionReplacement {
    readonly text: string;
    /** Actual code points removed from the complete model-facing replacement. */
    readonly savedChars: number;
}
/**
 * Build a deterministic replacement whose marker reports the actual reduction,
 * including the marker and retrieval instruction themselves.
 */
export declare function buildCompressionReplacement(mode: CompressionMode, original: string, body: string, spillId: string): CompressionReplacement | undefined;
export declare function parseCompressionMarker(text: string): CompressionMarker | undefined;
//# sourceMappingURL=compression.d.ts.map