import { Button, Dialog } from '@strapi/design-system';
import { WarningCircle } from '@strapi/icons';
import { useCallback, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { type BlockerFunction, useBlocker } from 'react-router-dom';

import { getTrad } from '../../../../translations';
import { shouldBlockNavigationLeave } from '../../utils/shouldBlockNavigationLeave';

interface Props {
  when: boolean;
}

const useWarnIfUnsavedChanges = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled]);
};

export const UnsavedChangesBlocker = ({ when }: Props) => {
  const { formatMessage } = useIntl();

  useWarnIfUnsavedChanges(when);

  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      shouldBlockNavigationLeave(when, currentLocation, nextLocation),
    [when]
  );

  const blocker = useBlocker(shouldBlock);

  if (blocker.state !== 'blocked') {
    return null;
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) {
          blocker.reset();
        }
      }}
    >
      <Dialog.Content>
        <Dialog.Header>
          {formatMessage(getTrad('components.unsavedChanges.dialog.header', 'Confirmation'))}
        </Dialog.Header>
        <Dialog.Body
          icon={<WarningCircle width="24px" height="24px" fill="danger600" />}
          textAlign="center"
        >
          {formatMessage(
            getTrad(
              'components.unsavedChanges.dialog.message',
              'Are you sure you want to leave this page? All your changes will be lost.'
            )
          )}
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Cancel>
            <Button variant="tertiary" fullWidth>
              {formatMessage(getTrad('components.unsavedChanges.dialog.button.cancel', 'Cancel'))}
            </Button>
          </Dialog.Cancel>
          <Button onClick={blocker.proceed} variant="danger" fullWidth>
            {formatMessage(getTrad('components.unsavedChanges.dialog.button.confirm', 'Confirm'))}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};
