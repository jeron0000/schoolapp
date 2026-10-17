import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import axios from 'axios';
import { getSizeStock } from '../../../shared/inventory';
import { ShopContext } from './shopContext';
import { useAuthSession } from '../../../shared/authSession';
import { createCartSync } from '../utils/cartSync';
import { cartPhpTotal, ORDER_FEE_PHP, PHP_SYMBOL } from '../../../shared/money.js';

const ShopContextProvider = (props) => {
  const currency = PHP_SYMBOL;
  const delivery_fee = ORDER_FEE_PHP;
  const backendUrl = import.meta.env.VITE_BACKEND_URL
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [cartItems, setCartItems] = useState({});
  const [cartReady, setCartReady] = useState(true);
  const [cartError, setCartError] = useState('');
  const [cartSync] = useState(() => createCartSync({
    onChange: setCartItems,
    onReady: setCartReady,
    onError: message => {
      setCartError(message);
      if (message) toast.error(message);
    }
  }));
  const [products, setProducts] = useState([]);
  const [productRequest, setProductRequest] = useState({ status: 'loading', error: '' });
  const productRequestId = useRef(0);
  const productsActive = useRef(true);
  const clearSessionCart = useCallback(() => cartSync.reset(), [cartSync]);
  const { token, setToken, sessionMessage, isCurrentSession } = useAuthSession(
    axios, backendUrl, 'customer', clearSessionCart
  );
  const navigate = useNavigate();
  const sessionNotice = useRef('');

  useEffect(() => {
    if (!sessionMessage) {
      sessionNotice.current = '';
      return;
    }
    if (sessionNotice.current === sessionMessage) return;
    sessionNotice.current = sessionMessage;
    toast.error(sessionMessage);
    navigate('/login?step=student', { replace: true });
  }, [sessionMessage, navigate]);

  const addToCart = async (itemId, size) => {
    try {
      if (!size) throw new Error('Select Product Size');
      return await cartSync.change(
        'add', itemId, size, undefined,
        getSizeStock(products.find(item => item._id === itemId), size)
      );
    } catch (error) {
      toast.error(error.message);
      throw error;
    }
  }

  const getCartCount = () => {
    let totalCount = 0;
    for (const items in cartItems) {
      for (const item in cartItems[items]) {
        try {
          if (cartItems[items][item] > 0) {
            totalCount += cartItems[items][item];
          }
        } catch {
          // Skip an unreadable cart entry when calculating the count.
        }
      }
    }
    return totalCount;
  }

  const updateQuantity = async (itemId, size, quantity) => {
    try {
      return await cartSync.change(
        'update', itemId, size, quantity,
        getSizeStock(products.find(item => item._id === itemId), size)
      );
    } catch (error) {
      toast.error(error.message);
      throw error;
    }
  }

  const getCartAmount = () => {
    try {
      return cartPhpTotal(products, cartItems);
    } catch {
      return NaN; // Invalid historical prices must not look like a free cart.
    }
  }

  const loadProducts = useCallback(() => {
    if (!productsActive.current) return Promise.resolve();
    const requestId = ++productRequestId.current;
    return axios.get(backendUrl + '/api/product/list')
      .then(response => {
        if (!productsActive.current || requestId !== productRequestId.current) return;
        if (response.data.success && Array.isArray(response.data.products)) {
          setProducts(response.data.products);
          setProductRequest({ status: 'success', error: '' });
        } else {
          const message = response.data.message || 'Unable to load products.';
          setProductRequest({ status: 'error', error: message });
          toast.error(message);
        }
      })
      .catch(error => {
        if (!productsActive.current || requestId !== productRequestId.current) return;
        console.log(error)
        setProductRequest({ status: 'error', error: error.message || 'Unable to load products.' });
        toast.error(error.message)
      })
  }, [backendUrl])

  const getProductsData = useCallback(() => {
    if (!productsActive.current) return Promise.resolve();
    setProductRequest({ status: 'loading', error: '' });
    return loadProducts();
  }, [loadProducts])

  useEffect(() => {
    cartSync.connect(token ? {
      isCurrent: () => isCurrentSession(token),
      request: async (operation, body) => (
        await axios.post(backendUrl + '/api/cart/' + operation, body, { headers: { token } })
      ).data
    } : null);
    return () => cartSync.disconnect();
  }, [backendUrl, token, isCurrentSession, cartSync]);

  useEffect(() => {
    productsActive.current = true;
    loadProducts();
    return () => {
      productsActive.current = false;
      productRequestId.current += 1;
    };
  }, [loadProducts]);

  const value = {
    products,
    currency,
    delivery_fee,
    productsLoading: productRequest.status === 'loading',
    productError: productRequest.error,
    search,
    setSearch,
    showSearch,
    setShowSearch,
    cartItems,
    addToCart,
    setCartItems: cart => cartSync.reset(cart),
    cartReady,
    cartError,
    reloadCart: cartSync.retry,
    isCartReady: cartSync.isReady,
    beginCartCheckout: cartSync.beginCheckout,
    getCartCount,
    updateQuantity,
    getCartAmount,
    navigate,
    backendUrl,
    setToken,
    token,
    sessionMessage,
    getProductsData
  }

  return (
    <ShopContext.Provider value={value}>
      {props.children}
    </ShopContext.Provider>
  )
}

export default ShopContextProvider;
