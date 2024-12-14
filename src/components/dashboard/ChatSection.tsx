import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const ChatSection = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Chat functionality coming soon...
        </p>
      </CardContent>
    </Card>
  );
};