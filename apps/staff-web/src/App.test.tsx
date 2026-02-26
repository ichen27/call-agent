import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('App login', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders login form when no session exists', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Staff Login' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('store id')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('email')).toBeInTheDocument();
  });

  it('shows error when login request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'nope' }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      )
    );

    render(<App />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('login failed')).toBeInTheDocument();
    });
  });
});
