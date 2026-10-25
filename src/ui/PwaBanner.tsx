/**
 * Step 9's install prompt and idle warning, plus the update-available toast.
 *
 * v2 spec §3: the banner is an inline row on Today and nowhere else — a fixed
 * strip over every screen covered the setup's sticky Start and the tray. The
 * service worker still registers on every screen, because a first-run player
 * never sees Today and offline must work for them too: `PwaRegistrar` is
 * mounted once in `main.tsx` and publishes the worker's state to `usePwa`;
 * `PwaBanner` only reads it.
 *
 * Reads its own data independently (`listCompletions`/`listLibrary`) rather
 * than lifting state out of `App` — this is the one place in the UI layer
 * that cares about install/idle status, and `App` already carries plenty.
 */

import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { create } from 'zustand';
import { listCompletions } from '@/persist/completions';
import { listLibrary } from '@/persist/library';
import { lastActivityAt, shouldOfferInstall, shouldWarnIdle } from '@/play/pwa';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS Safari's own flag — there is no `display-mode` media match there.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

interface PwaState {
  offlineReady: boolean;
  needRefresh: boolean;
  update: () => void;
  dismissOffline: () => void;
  dismissRefresh: () => void;
}

const usePwa = create<PwaState>(() => ({
  offlineReady: false,
  needRefresh: false,
  update: () => {},
  dismissOffline: () => {},
  dismissRefresh: () => {},
}));

/** Registers the service worker on every screen; renders nothing. */
export function PwaRegistrar(): null {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    usePwa.setState({
      offlineReady,
      needRefresh,
      update: () => void updateServiceWorker(true),
      dismissOffline: () => setOfflineReady(false),
      dismissRefresh: () => setNeedRefresh(false),
    });
  }, [offlineReady, needRefresh, updateServiceWorker, setOfflineReady, setNeedRefresh]);
  return null;
}

export function PwaBanner(): React.ReactElement | null {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [completions, setCompletions] = useState(0);
  const [idle, setIdle] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [idleDismissed, setIdleDismissed] = useState(false);

  const { offlineReady, needRefresh, update, dismissOffline, dismissRefresh } = usePwa();

  useEffect(() => {
    const onBeforeInstall = (event: Event): void => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  useEffect(() => {
    void Promise.all([listCompletions(), listLibrary()]).then(([completionRecords, entries]) => {
      setCompletions(completionRecords.length);
      const last = lastActivityAt(
        entries.map((e) => e.updatedAt),
        completionRecords.map((c) => c.completedAt),
      );
      setIdle(shouldWarnIdle(last, Date.now()));
    });
  }, []);

  const offerInstall =
    !installDismissed &&
    shouldOfferInstall(completions, isStandalone()) &&
    (deferredPrompt !== null || isIOS());

  if (needRefresh) {
    return (
      <Banner>
        <span>New content available.</span>
        <button
          type="button"
          className="touch-target rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-[var(--mat-void)]"
          onClick={update}
        >
          Reload
        </button>
        <DismissButton onClick={dismissRefresh} />
      </Banner>
    );
  }

  if (offlineReady) {
    return (
      <Banner>
        <span>Tessera is ready to play offline.</span>
        <DismissButton onClick={dismissOffline} />
      </Banner>
    );
  }

  if (offerInstall) {
    return (
      <Banner>
        {deferredPrompt ? (
          <>
            <span>Install Tessera for a full-screen, offline-ready app.</span>
            <button
              type="button"
              aria-label="Install Tessera"
              className="touch-target rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-[var(--mat-void)]"
              onClick={() => {
                void deferredPrompt.prompt();
                void deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
              }}
            >
              Install
            </button>
          </>
        ) : (
          <span>Add Tessera to your Home Screen: tap Share, then "Add to Home Screen".</span>
        )}
        <DismissButton
          aria-label="Dismiss install suggestion"
          onClick={() => setInstallDismissed(true)}
        />
      </Banner>
    );
  }

  if (idle && !idleDismissed) {
    return (
      <Banner>
        <span>
          It's been a week since you last played — Safari can clear an unopened tab's storage.
          Open Tessera again soon to keep your puzzles safe.
        </span>
        <DismissButton aria-label="Dismiss idle warning" onClick={() => setIdleDismissed(true)} />
      </Banner>
    );
  }

  return null;
}

function Banner({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-raised)] px-4 py-2 text-2 text-[var(--ink-primary)] [&>span]:min-w-[12rem] [&>span]:flex-1"
    >
      {children}
    </div>
  );
}

function DismissButton({
  onClick,
  'aria-label': ariaLabel = 'Dismiss',
}: {
  onClick: () => void;
  'aria-label'?: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="touch-target rounded-[var(--radius-sm)] px-2 text-[var(--ink-muted)]"
    >
      ✕
    </button>
  );
}
