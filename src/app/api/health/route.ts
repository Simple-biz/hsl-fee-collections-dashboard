import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases } from "@/lib/db/schema";
import { count } from "drizzle-orm";

export const GET = async () => {
  try {
    const [result] = await db.select({ total: count() }).from(cases);
    return NextResponse.json({
      status: "ok",
      database: "connected",
      totalCases: result.total,
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: (error as Error).message },
      { status: 500 },
    );
  }
};
