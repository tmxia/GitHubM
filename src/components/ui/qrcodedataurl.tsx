
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeDataUrlProps {
  text: string;

  width?: number;

  color?: string;

  backgroundColor?: string;

  className?: string;
}

const QRCodeDataUrl: React.FC<QRCodeDataUrlProps> = ({
  text,
  width = 128,
  color = '#000000',
  backgroundColor = '#ffffff',
  className = '',
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    const generateQR = async () => {
      try {
        const url = await QRCode.toDataURL(text, {
          width,
          color: {
            dark: color,
            light: backgroundColor,
          },
        });
        setDataUrl(url);
      } catch (err) {
        console.error('Failed to generate QR code:', err);
      }
    };

    generateQR();
  }, [text, width, color, backgroundColor]);

  return (
    <div className={`qr-code-container ${className}`}>
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={`QR Code: ${text}`}
          width={width}
          height={width}
        />
      ) : (
        <div>Generating QR code...</div>
      )}
    </div>
  );
};

export default QRCodeDataUrl;