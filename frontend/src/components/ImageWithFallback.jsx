import { useState } from "react";

const ImageWithFallback = ({ src, name }) => {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img src={src} alt={name} onError={() => setFailed(true)} />
  ) : (
    <span>Image unavailable</span>
  );
};

export default ImageWithFallback;
