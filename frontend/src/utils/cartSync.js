import {
  cartSnapshot,
  cartValue,
  validCartId,
  validCartNumber,
  validCartSize,
  withCartQuantity
} from '../../../shared/cart.js';

const sessionChangedError = () => new Error('Your session changed. Please try again.');
const invalidCartError = () => new Error('Select a valid product, size and whole quantity.');
const unavailableQuantityError = () => new Error('The requested quantity is unavailable for this size.');

// One ordered client queue; confirmed state plus pending intentions is the only cart source.
export const createCartSync = ({ onChange, onReady, onError }) => {
  let confirmed = cartSnapshot();
  let pending = [];
  let session = null;
  let generation = 0;
  let synchronized = true;
  let checkout = false;
  let queue = Promise.resolve();

  const current = (epoch, owner) => {
    if (epoch !== generation || session !== owner) return false;
    return !owner || owner.isCurrent();
  };

  const view = () => pending.reduce((cart, item) => {
    let quantity = item.quantity;
    if (item.operation === 'add') {
      quantity = cartValue(cart, item.itemId, item.size) + 1;
    }
    if (!validCartNumber(quantity)) return cart;
    return withCartQuantity(cart, item.itemId, item.size, quantity);
  }, confirmed.cartData);

  const isReady = () => {
    const activeSession = !session || session.isCurrent();
    return synchronized && pending.length === 0 && !checkout && activeSession;
  };

  const publish = () => {
    onChange(view());
    onReady(isReady());
  };

  const parse = response => {
    if (response?.success !== true) {
      throw new Error(response?.message || 'Unable to save your cart. Please try again.');
    }
    if (!Object.hasOwn(response, 'cartData') || !Object.hasOwn(response, 'cartVersions')) {
      throw new Error('Refresh the page to load your current cart.');
    }
    return cartSnapshot(response);
  };

  const refresh = async (epoch, owner) => {
    if (!current(epoch, owner)) throw sessionChangedError();
    const snapshot = parse(await owner.request('get', {}));
    if (!current(epoch, owner)) throw sessionChangedError();
    confirmed = snapshot;
    synchronized = true;
    onError('');
  };

  const reset = (cart = {}) => {
    generation++;
    pending = [];
    confirmed = cartSnapshot({ cartData: cart, cartVersions: confirmed.cartVersions });
    synchronized = true;
    checkout = false;
    onError('');
    publish();
  };

  const connect = owner => {
    confirmed = cartSnapshot();
    reset();
    session = owner;
    const epoch = generation;
    synchronized = !owner;
    publish();

    if (!owner) {
      queue = Promise.resolve();
      return;
    }

    queue = refresh(epoch, owner)
      .catch(error => {
        if (!current(epoch, owner)) return;
        synchronized = false;
        onError(error.message);
      })
      .finally(() => {
        if (current(epoch, owner)) publish();
      });
  };

  const validateChange = (operation, itemId, size, quantity, stock) => {
    if (!validCartId(itemId) || !validCartSize(size)) throw invalidCartError();
    if (operation === 'update' && !validCartNumber(quantity)) throw invalidCartError();

    let nextQuantity = quantity;
    if (operation === 'add') nextQuantity = cartValue(view(), itemId, size) + 1;
    if (!validCartNumber(nextQuantity)) throw unavailableQuantityError();
    if (nextQuantity > 0 && (!validCartNumber(stock) || nextQuantity > stock)) {
      throw unavailableQuantityError();
    }
  };

  const change = (operation, itemId, size, quantity, stock) => {
    if (checkout) {
      return Promise.reject(new Error('Please wait for checkout to finish before changing your cart.'));
    }
    try {
      validateChange(operation, itemId, size, quantity, stock);
    } catch (error) {
      return Promise.reject(error);
    }

    const epoch = generation;
    const owner = session;
    const item = { operation, itemId, size, quantity };
    pending.push(item);
    publish();

    const run = async () => {
      if (!current(epoch, owner)) throw sessionChangedError();
      if (!owner) {
        let nextQuantity = quantity;
        if (operation === 'add') {
          nextQuantity = cartValue(confirmed.cartData, itemId, size) + 1;
        }
        confirmed.cartData = withCartQuantity(confirmed.cartData, itemId, size, nextQuantity);
        return;
      }

      // Never write from a failed restoration or uncertain prior mutation.
      if (!synchronized) await refresh(epoch, owner);
      const body = {
        itemId,
        size,
        expectedVersion: cartValue(confirmed.cartVersions, itemId, size),
        expectedQuantity: cartValue(confirmed.cartData, itemId, size)
      };
      if (operation === 'update') body.quantity = quantity;

      try {
        const response = await owner.request(operation, body);
        if (!current(epoch, owner)) throw sessionChangedError();
        confirmed = parse(response);
      } catch (error) {
        if (!current(epoch, owner)) throw error;
        // A timeout may follow a committed write. Read authoritative state; do not replay it.
        synchronized = false;
        try {
          await refresh(epoch, owner);
        } catch {
          synchronized = false;
          onError('Your saved cart could not be refreshed. Reload it before checkout.');
        }
        throw new Error(error.response?.data?.message || error.message || 'Unable to save your cart. Please try again.');
      }
    };

    const result = queue.then(run).finally(() => {
      if (!current(epoch, owner)) return;
      pending = pending.filter(entry => entry !== item);
      publish();
    });
    queue = result.catch(() => {});
    return result;
  };

  const beginCheckout = () => {
    if (!isReady()) throw new Error('Your cart is still syncing. Please try again after it finishes.');
    const epoch = generation;
    const owner = session;
    const snapshot = cartSnapshot(confirmed);
    checkout = true;
    publish();

    return {
      snapshot,
      isCurrent: () => current(epoch, owner) && checkout,
      complete: async cleanupPending => {
        if (!current(epoch, owner) || !checkout) return;
        synchronized = false;
        publish();
        try {
          if (owner) {
            await refresh(epoch, owner);
          } else {
            // Guests have no persisted COD cart to clear. Preserve their local data.
            synchronized = true;
          }
          if (current(epoch, owner) && cleanupPending) {
            onError('Your order was placed, but cart cleanup could not be confirmed. Review your saved cart before ordering again.');
          }
        } catch {
          if (current(epoch, owner)) {
            onError('Your order was placed, but your saved cart could not be refreshed. Reload it before checkout.');
          }
        }
        if (current(epoch, owner)) publish();
      },
      finish: () => {
        if (epoch !== generation) return;
        checkout = false;
        publish();
      }
    };
  };

  const disconnect = () => {
    generation++;
    pending = [];
    session = null;
    synchronized = false;
  };

  const retry = () => {
    const epoch = generation;
    const owner = session;
    if (!owner || checkout) return Promise.resolve();
    synchronized = false;
    publish();
    const result = queue
      .then(() => refresh(epoch, owner))
      .catch(error => {
        if (!current(epoch, owner)) return;
        synchronized = false;
        onError(error.message);
      })
      .finally(() => {
        if (current(epoch, owner)) publish();
      });
    queue = result;
    return result;
  };

  return { connect, disconnect, reset, change, retry, isReady, beginCheckout };
};
