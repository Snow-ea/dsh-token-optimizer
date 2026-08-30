export declare function spillIdFor(content: string): string;
/**
 * Durable, session-authorized archive for complete pre-compression text.
 * A session-local artifact is both the content record and its authorization;
 * therefore no shared-artifact/reference two-phase commit exists.
 */
export declare class SpillArchive {
    readonly root: string;
    constructor(root?: string);
    private sessionDir;
    private artifactPath;
    private lineagePath;
    private writeAtomically;
    recordSession(sessionId: string, parentSessionId?: string): Promise<void>;
    save(ownerSessionId: string, parentSessionId: string | undefined, spillId: string, content: string): Promise<void>;
    private parentOf;
    retrieve(ownerSessionId: string, parentSessionId: string | undefined, spillId: string): Promise<string>;
}
//# sourceMappingURL=archive.d.ts.map