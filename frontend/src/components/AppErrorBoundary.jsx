import { Component } from 'react';

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    if (typeof console !== 'undefined') {
      console.error('AppErrorBoundary caught an error:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="card">
          <h1 className="text-xl font-semibold text-primary-900">Se produjo un error en la interfaz</h1>
          <p className="mt-2 text-sm text-primary-700">
            Recarga la página. Si el problema persiste, el error quedó atrapado para evitar que toda la pantalla se
            quede en blanco.
          </p>
        </section>
      );
    }

    return this.props.children;
  }
}
