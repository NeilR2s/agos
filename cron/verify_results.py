import sqlite3

import pandas as pd


def verify():
    conn = sqlite3.connect("trading_data.db")

    print("--- Table Counts ---")
    for table in ["pse_stock_data", "bval_rates", "fi_market", "macro_data"]:
        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"{table}: {count}")

    print("\n--- PSA Macro Data (GDP/Inflation) ---")
    psa_query = (
        "SELECT date, category, indicator, value, scraped_at "
        "FROM macro_data WHERE source='PSA' LIMIT 10"
    )
    df_psa = pd.read_sql_query(psa_query, conn)
    print(df_psa)

    print("\n--- BSP Macro Data (Key Rates) ---")
    bsp_query = (
        "SELECT date, indicator, value, scraped_at FROM macro_data WHERE source='BSP' LIMIT 5"
    )
    df_bsp = pd.read_sql_query(bsp_query, conn)
    print(df_bsp)

    print("\n--- Schema Check (MacroData) ---")
    cols = conn.execute("PRAGMA table_info(macro_data)").fetchall()
    for col in cols:
        print(col)

    conn.close()


if __name__ == "__main__":
    verify()
