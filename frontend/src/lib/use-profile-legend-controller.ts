import { useRef, useState } from 'react';
import { ProfileLegendController } from './app-controller';

type ControllerMutation = () => void;
type ControllerAsyncMutation = () => Promise<void>;

export function useProfileLegendController(): {
  controller: ProfileLegendController;
  act: (fn: ControllerMutation) => void;
  run: (fn: ControllerAsyncMutation) => Promise<void>;
} {
  const [, setVersion] = useState(0);
  const controllerRef = useRef<ProfileLegendController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new ProfileLegendController(() => {
      setVersion((version) => version + 1);
    });
  }

  const controller = controllerRef.current;

  const refresh = () => {
    setVersion((version) => version + 1);
  };

  const act = (fn: ControllerMutation) => {
    fn();
    refresh();
  };

  const run = async (fn: ControllerAsyncMutation) => {
    const pending = fn();
    refresh();

    try {
      await pending;
    } finally {
      refresh();
    }
  };

  return { controller, act, run };
}
