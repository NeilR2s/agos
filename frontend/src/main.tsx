import { StrictMode, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App.tsx'

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(error => {
            console.error('Service Worker registration failed:', error);
        });
    });
}

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
})

export function ScrollStateBinder() {
    const timeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)

    useEffect(() => {
        const root = document.documentElement

        const clearScrollState = () => {
            if (timeoutRef.current !== null) {
                window.clearTimeout(timeoutRef.current)
            }

            timeoutRef.current = window.setTimeout(() => {
                root.classList.remove('is-scrolling')
                timeoutRef.current = null
            }, 150)
        }

        const markScrolling = () => {
            root.classList.add('is-scrolling')
            clearScrollState()
        }

        const handleScroll = () => {
            markScrolling()
        }

        document.addEventListener('scroll', handleScroll, true)

        return () => {
            document.removeEventListener('scroll', handleScroll, true)

            if (timeoutRef.current !== null) {
                window.clearTimeout(timeoutRef.current)
                timeoutRef.current = null
            }

            root.classList.remove('is-scrolling')
        }
    }, [])

    return null
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ScrollStateBinder />
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
    </StrictMode>,
)
