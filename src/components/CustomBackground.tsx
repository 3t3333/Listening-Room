export function CustomBackground({ imageUrl, opacity }: { imageUrl: string | null; opacity: number }) {
  if (!imageUrl) return null;
  return <img className="custom-background" src={imageUrl} alt="" style={{ opacity }} decoding="async" draggable={false} />;
}
