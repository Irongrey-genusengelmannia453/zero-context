import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ZeroContextToast } from './ZeroContextToast';

describe('ZeroContextToast (UI Logic)', () => {
    let toast: ZeroContextToast;

    beforeEach(() => {
        vi.useFakeTimers();
        toast = new ZeroContextToast();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should initialize in IDLE state', () => {
        expect(toast.state.state).toBe('IDLE');
    });

    it('should transition to REDACTING (indeterminate)', () => {
        toast.showIndeterminateRedacting();
        
        expect(toast.state).toEqual({
            state: 'REDACTING'
        });
    });

    it('should transition to ERROR state', () => {
        toast.showError("Network failed");
        
        expect(toast.state).toEqual({
            state: 'ERROR',
            message: 'Network failed'
        });
    });

    it('should transition to DOWNLOADING_MODEL and calculate percentage', () => {
        toast.updateDownloadProgress(500, 1000); // 500 bytes of 1000
        
        expect(toast.state).toEqual({
            state: 'DOWNLOADING_MODEL',
            loadedBytes: 500,
            totalBytes: 1000,
            progressPercent: 50
        });
        expect(toast.showTimestamp).toBeGreaterThan(0);
    });

    describe('Anti-Flicker Logic (hide)', () => {
        it('should hide immediately if 750ms have already passed', () => {
            toast.showIndeterminateRedacting();
            
            // Advance time past the 750ms threshold
            vi.advanceTimersByTime(1000);
            
            toast.hide();
            
            // Because time has passed, it should immediately transition to IDLE
            expect(toast.state.state).toBe('IDLE');
        });

        it('should DELAY hide if called before 750ms elapsed', () => {
            toast.showIndeterminateRedacting(); // Timestamp is Date.now()
            
            // Advance by only 200ms
            vi.advanceTimersByTime(200);
            
            toast.hide(); // Should not hide immediately!
            expect(toast.state.state).not.toBe('IDLE'); // Still redacting
            
            // Advance by remaining 550ms
            vi.advanceTimersByTime(550);
            
            // Now it should be IDLE
            expect(toast.state.state).toBe('IDLE');
        });

        it('should enforce an 8000ms display time for ERROR states', () => {
            toast.showError('Failure');
            
            // Call hide immediately
            toast.hide();
            
            // Should still be ERROR state
            expect(toast.state.state).toBe('ERROR');
            
            vi.advanceTimersByTime(7900); // Almost 8000ms
            expect(toast.state.state).toBe('ERROR');
            
            vi.advanceTimersByTime(100); // 8000ms reached
            expect(toast.state.state).toBe('IDLE');
        });
    });
});
