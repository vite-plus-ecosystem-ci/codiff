import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  useOptimistic,
  useTransition,
} from 'react';
import { useFormStatus } from 'react-dom';

export const buttonVariants = cva('codiff-button', {
  defaultVariants: {
    size: 'default',
    variant: 'default',
  },
  variants: {
    size: {
      default: 'codiff-button-size-default',
      icon: 'codiff-button-size-icon',
      lg: 'codiff-button-size-lg',
      sm: 'codiff-button-size-sm',
    },
    variant: {
      default: 'codiff-button-default',
      destructive: 'codiff-button-destructive',
      ghost: 'codiff-button-ghost',
      link: 'codiff-button-link',
      outline: 'codiff-button-outline',
      secondary: 'codiff-button-secondary',
    },
  },
});

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    action?: () => Promise<unknown> | unknown;
    asChild?: boolean;
    pendingPlaceholder?: ReactNode;
  };

export function Button({
  action,
  asChild = false,
  children,
  className,
  disabled,
  onClick: initialOnClick,
  pendingPlaceholder = '…',
  size,
  type,
  variant,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  const [optimisticIsPending, setOptimisticIsPending] = useOptimistic(false);
  const [transitionIsPending, startTransition] = useTransition();
  const { pending: formIsPending } = useFormStatus();

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    initialOnClick?.(event);

    if (!action || event.defaultPrevented) {
      return;
    }

    event.preventDefault();
    startTransition(async () => {
      setOptimisticIsPending(true);
      await action();
    });
  };

  const isPending = transitionIsPending || optimisticIsPending || formIsPending;

  return (
    <Component
      aria-busy={isPending || undefined}
      className={buttonVariants({ className, size, variant })}
      disabled={disabled || isPending || undefined}
      onClick={initialOnClick || action ? onClick : undefined}
      type={type}
      {...props}
    >
      {isPending ? pendingPlaceholder : children}
    </Component>
  );
}
