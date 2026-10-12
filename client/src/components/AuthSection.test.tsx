// AuthSection component tests: error-notice surfacing, mode-dependent fields,
// and submit behaviour.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AuthSection } from './AuthSection'

const baseProps = {
  authMode: 'signin' as const,
  onAuthModeChange: vi.fn(),
  email: '',
  onEmailChange: vi.fn(),
  password: '',
  onPasswordChange: vi.fn(),
  displayName: '',
  onDisplayNameChange: vi.fn(),
  authError: null as string | null,
  authLoading: false,
  onSubmit: vi.fn(),
}

afterEach(() => {
  cleanup()
})

describe('AuthSection', () => {
  it('renders sign-in copy and calls onSubmit when the form is submitted', () => {
    const onSubmit = vi.fn()
    const { container } = render(<AuthSection {...baseProps} onSubmit={onSubmit} />)
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    // The toggle button and the submit button share the name 'Sign in', so
    // target the form element directly.
    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    if (form) fireEvent.submit(form)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('surfaces the server authentication error', () => {
    render(<AuthSection {...baseProps} authError="Email or password is incorrect." />)
    expect(screen.getByText('Email or password is incorrect.')).toBeTruthy()
  })

  it('shows the full-name field only when registering', () => {
    const view = render(<AuthSection {...baseProps} authMode="signup" />)
    expect(screen.getByPlaceholderText('Your full name')).toBeTruthy()
    view.rerender(<AuthSection {...baseProps} authMode="signin" />)
    expect(screen.queryByPlaceholderText('Your full name')).toBeNull()
  })

  it('requires at least 6 password characters', () => {
    render(<AuthSection {...baseProps} />)
    const password = screen.getByPlaceholderText('At least 6 characters')
    expect(password.getAttribute('minlength')).toBe('6')
  })

  it('disables the submit button while loading', () => {
    render(<AuthSection {...baseProps} authLoading />)
    expect(screen.getByRole('button', { name: 'Please wait...' })).toHaveProperty('disabled', true)
  })
})